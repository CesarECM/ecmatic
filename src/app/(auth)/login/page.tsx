import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Iniciar sesión · ECMatic" };

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
