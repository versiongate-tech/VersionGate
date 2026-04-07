import { createContext, useContext } from "react";

/** Opens the global "New project" dialog (provided by Layout). */
export const CreateProjectLaunchContext = createContext<() => void>(() => {
  /* no-op if outside provider */
});

export function useLaunchCreateProject(): () => void {
  return useContext(CreateProjectLaunchContext);
}
