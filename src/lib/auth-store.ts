// Mock auth — replace with real backend later.
export type AuthUser = { email: string; name: string };

const KEY = "aurora.auth.v1";

export const authStore = {
  current(): AuthUser | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  },
  signIn(email: string) {
    const user: AuthUser = { email, name: email.split("@")[0] };
    localStorage.setItem(KEY, JSON.stringify(user));
    window.dispatchEvent(new Event("aurora:auth"));
    return user;
  },
  signOut() {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("aurora:auth"));
  },
  subscribe(cb: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    const h = () => cb();
    window.addEventListener("aurora:auth", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("aurora:auth", h);
      window.removeEventListener("storage", h);
    };
  },
};
