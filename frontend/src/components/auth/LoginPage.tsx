import React, { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useTheme } from "../../contexts/ThemeContext";
import { Button } from "../common/Button";
import { Sun, Moon, Eye, EyeOff } from "lucide-react";

export function LoginPage() {
  const { login, register } = useAuth();
  const { toast } = useToast();
  const { theme, toggle } = useTheme();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      toast("Please fill in all required fields.", "error");
      return;
    }

    if (mode === "register" && !displayName.trim()) {
      toast("Display name is required.", "error");
      return;
    }

    if (password.length < 6) {
      toast("Password must be at least 6 characters.", "error");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
        toast("Welcome back!", "success");
      } else {
        await register(email.trim(), password, displayName.trim());
        toast("Account created successfully!", "success");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode((prev) => (prev === "login" ? "register" : "login"));
    setDisplayName("");
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none dark:block hidden">
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-blue-500/[0.04] rounded-full blur-[100px]" />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-violet-500/[0.04] rounded-full blur-[100px]" />
      </div>

      {/* Theme toggle — top right */}
      <div className="absolute top-5 right-6 z-20">
        <button
          onClick={toggle}
          className="p-2.5 rounded-xl text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.05] hover:text-gray-600 dark:hover:text-gray-200 transition-all duration-200"
          title="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="w-[18px] h-[18px]" />
          ) : (
            <Moon className="w-[18px] h-[18px]" />
          )}
        </button>
      </div>

      {/* Centered content */}
      <div className="flex-1 flex items-center justify-center px-4 relative z-10">
        <div className="w-full max-w-sm animate-in">
          {/* Logo — big, front and center */}
          <div className="text-center mb-10">
            <img
              src="/codevvtransparentlogo.webp"
              alt="Codevv"
              className="h-48 mx-auto mb-6"
            />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {mode === "login"
                ? "Sign in to your workspace"
                : "Create your account"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Display name (register only) */}
            {mode === "register" && (
              <div>
                <label
                  htmlFor="displayName"
                  className="block text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5"
                >
                  Display Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 focus:border-amber-500 dark:focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-colors duration-200"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                className="w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 focus:border-amber-500 dark:focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-colors duration-200"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-3.5 py-2.5 pr-10 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 focus:border-amber-500 dark:focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-colors duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              loading={loading}
              className="w-full mt-2"
              size="lg"
            >
              {mode === "login" ? "Sign In" : "Create Account"}
            </Button>
          </form>

          {/* Toggle mode */}
          <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-500">
            {mode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-amber-500 dark:text-amber-400 hover:underline font-medium"
                >
                  Register
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-amber-500 dark:text-amber-400 hover:underline font-medium"
                >
                  Sign In
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center text-xs text-gray-400 dark:text-gray-600">
        AI-assisted software design
      </footer>
    </div>
  );
}
