import type { FastifyReply, FastifyRequest } from "fastify";
import type { GitHubInstallation } from "@prisma/client";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { config } from "../config/env";
import prisma from "../prisma/client";
import { EnvironmentRepository } from "../repositories/environment.repository";
import { ProjectRepository } from "../repositories/project.repository";
import { enqueueJob } from "../services/job-queue";
import { getUserFromSessionToken } from "../services/auth.service";
import { getSessionTokenFromRequest } from "../utils/cookie";
import { logger } from "../utils/logger";
import { createInstallState, parseInstallState } from "../utils/github-install-state";
import { getInstallationAccessToken } from "../utils/github-installation-token";
import { normalizeGithubRepoUrl } from "../utils/github-repo-url";
import { verifyGithubWebhookSignature } from "../utils/github-webhook-signature";

const projectRepo = new ProjectRepository();
const envRepo = new EnvironmentRepository();

const INSTALL_APP_URL = "https://github.com/apps/VersionGate-App/installations/new";

function githubAppReady(): boolean {
  const appId = Number(config.githubAppId);
  return Number.isFinite(appId) && appId > 0 && !!config.githubAppPrivateKey?.trim();
}

interface GitHubPushPayload {
  ref?: string;
  repository?: { clone_url?: string; html_url?: string };
}

type ReqWithRaw = FastifyRequest & { rawBody?: Buffer };

export async function githubInstallHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!githubAppReady()) {
    reply.code(503).send({
      error: "ServiceUnavailable",
      message: "GitHub App is not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.",
    });
    return;
  }

  const raw = getSessionTokenFromRequest(req.headers.cookie);
  const user = await getUserFromSessionToken(raw);
  if (!user) {
    reply.code(401).send({ error: "Unauthorized", message: "Sign in required", code: "AUTH_REQUIRED" });
    return;
  }

  const url = new URL(INSTALL_APP_URL);
  const secret = config.githubWebhookSecret;
  if (secret) {
    url.searchParams.set("state", createInstallState(user.id, secret));
  }

  reply.redirect(302, url.toString());
}

export async function githubCallbackHandler(
  req: FastifyRequest<{ Querystring: Record<string, string | undefined> }>,
  reply: FastifyReply
): Promise<void> {
  if (!githubAppReady()) {
    reply.redirect(302, "/?github=config");
    return;
  }

  const installationIdStr = req.query.installation_id ?? "";
  const setupAction = req.query.setup_action ?? "";

  if (!installationIdStr || !/^\d+$/.test(installationIdStr)) {
    reply.redirect(302, "/?github=missing_installation");
    return;
  }

  const secret = config.githubWebhookSecret;
  let userId = secret ? parseInstallState(req.query.state, secret) : null;
  if (!userId) {
    const raw = getSessionTokenFromRequest(req.headers.cookie);
    const user = await getUserFromSessionToken(raw);
    userId = user?.id ?? null;
  }
  if (!userId) {
    reply.redirect(302, "/?github=auth_required");
    return;
  }

  if (setupAction === "request") {
    reply.redirect(302, "/");
    return;
  }

  const auth = createAppAuth({
    appId: Number(config.githubAppId),
    privateKey: config.githubAppPrivateKey,
  });
  const { token } = await auth({ type: "app" });
  const octokit = new Octokit({ auth: token });
  const { data: installation } = await octokit.rest.apps.getInstallation({
    installation_id: Number(installationIdStr),
  });

  const account = installation.account;
  if (!account || typeof account !== "object") {
    reply.redirect(302, "/?github=bad_installation");
    return;
  }
  const login = "login" in account ? account.login : "";
  const accountType = "type" in account ? String(account.type) : "unknown";
  const installationId = BigInt(installationIdStr);

  await prisma.gitHubInstallation.upsert({
    where: { installationId },
    create: {
      userId,
      installationId,
      githubAccountLogin: login,
      githubAccountType: accountType,
    },
    update: {
      userId,
      githubAccountLogin: login,
      githubAccountType: accountType,
    },
  });

  reply.redirect(302, "/");
}

export async function githubReposHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!githubAppReady()) {
    reply.code(503).send({
      error: "ServiceUnavailable",
      message: "GitHub App is not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.",
    });
    return;
  }

  const raw = getSessionTokenFromRequest(req.headers.cookie);
  const user = await getUserFromSessionToken(raw);
  if (!user) {
    reply.code(401).send({ error: "Unauthorized", message: "Sign in required", code: "AUTH_REQUIRED" });
    return;
  }

  const q = req.query as { installationId?: string };
  let row: GitHubInstallation | null;
  if (q.installationId && /^\d+$/.test(q.installationId)) {
    row = await prisma.gitHubInstallation.findFirst({
      where: { userId: user.id, installationId: BigInt(q.installationId) },
    });
  } else {
    row = await prisma.gitHubInstallation.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
  }

  if (!row) {
    reply.code(400).send({
      error: "BadRequest",
      message: "No GitHub App installation for this user. Open /api/auth/github/install first.",
    });
    return;
  }

  const { token } = await getInstallationAccessToken(row.installationId);
  const octokit = new Octokit({ auth: token });

  const repositories: Awaited<
    ReturnType<Octokit["rest"]["apps"]["listReposAccessibleToInstallation"]>
  >["data"]["repositories"] = [];

  let page = 1;
  for (;;) {
    const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
      page,
    });
    repositories.push(...data.repositories);
    if (data.repositories.length < 100) break;
    page += 1;
  }

  reply.code(200).send({
    installationId: row.installationId.toString(),
    totalCount: repositories.length,
    repositories: repositories.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch,
      cloneUrl: r.clone_url,
      htmlUrl: r.html_url,
    })),
  });
}

export async function githubAppWebhookHandler(req: ReqWithRaw, reply: FastifyReply): Promise<void> {
  const secret = config.githubWebhookSecret;
  if (!secret) {
    reply.code(503).send({
      error: "ServiceUnavailable",
      message: "GITHUB_WEBHOOK_SECRET is not configured.",
    });
    return;
  }

  const rawBody = req.rawBody;
  if (!rawBody?.length) {
    reply.code(400).send({ error: "BadRequest", message: "Missing raw body for signature verification" });
    return;
  }

  const sig = req.headers["x-hub-signature-256"];
  const sigStr = Array.isArray(sig) ? sig[0] : sig;
  if (!verifyGithubWebhookSignature(rawBody, sigStr, secret)) {
    reply.code(401).send({ error: "Unauthorized", message: "Invalid webhook signature" });
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    reply.code(400).send({ error: "BadRequest", message: "Invalid JSON body" });
    return;
  }

  const event = req.headers["x-github-event"];
  const eventStr = (Array.isArray(event) ? event[0] : event)?.toLowerCase() ?? "";

  if (eventStr === "ping") {
    reply.code(200).send({ ok: true, ping: true });
    return;
  }

  if (eventStr !== "push") {
    reply.code(200).send({ skipped: true, reason: `Ignoring event: ${eventStr || "unknown"}` });
    return;
  }

  const payload = body as GitHubPushPayload;
  const ref = payload.ref ?? "";
  const pushedBranch = ref.replace("refs/heads/", "");
  const cloneUrl = payload.repository?.clone_url ?? "";
  const htmlUrl = payload.repository?.html_url ?? "";
  const normalized = normalizeGithubRepoUrl(cloneUrl || htmlUrl);

  if (!normalized) {
    reply.code(200).send({ skipped: true, reason: "Could not determine repository URL" });
    return;
  }

  const projects = await projectRepo.findAll();
  const matches = projects.filter((p) => normalizeGithubRepoUrl(p.repoUrl) === normalized);

  if (matches.length === 0) {
    logger.info({ normalized }, "GitHub App webhook: no VersionGate project matches repository");
    reply.code(200).send({ skipped: true, reason: "No matching project for repository" });
    return;
  }

  const triggered: string[] = [];
  for (const project of matches) {
    const defaultEnv = await envRepo.findDefaultForProject(project.id);
    if (!defaultEnv) {
      logger.error({ projectId: project.id }, "GitHub App webhook: no default environment — skipping deploy");
      continue;
    }
    if (pushedBranch && pushedBranch !== defaultEnv.branch) {
      logger.info(
        { projectId: project.id, pushedBranch, configuredBranch: defaultEnv.branch },
        "GitHub App webhook: branch mismatch — skipping"
      );
      continue;
    }

    logger.info(
      { projectId: project.id, projectName: project.name, environmentId: defaultEnv.id, ref },
      "GitHub App webhook: triggering auto-deploy"
    );

    await enqueueJob("DEPLOY", project.id, {}, defaultEnv.id);
    triggered.push(project.name);
  }

  reply.code(200).send({ triggered: triggered.length > 0, projects: triggered });
}
