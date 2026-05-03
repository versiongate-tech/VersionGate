const HOSTNAME_LABEL_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export function isValidIpv4Address(value: string): boolean {
  const octets = value.split(".");
  if (octets.length !== 4) {
    return false;
  }

  return octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) {
      return false;
    }
    const parsed = Number.parseInt(octet, 10);
    return parsed >= 0 && parsed <= 255;
  });
}

export function isValidHostname(value: string): boolean {
  if (value.length === 0 || value.length > 253 || value.startsWith(".") || value.endsWith(".")) {
    return false;
  }

  const labels = value.split(".");
  return labels.every((label) => HOSTNAME_LABEL_REGEX.test(label));
}
