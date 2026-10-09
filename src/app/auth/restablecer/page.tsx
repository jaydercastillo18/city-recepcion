import type { Metadata } from "next";
import ResetPasswordForm from "@/features/auth/components/reset-password-form";
export const metadata: Metadata = {
  title: "Restablecer contraseña | City Ofertas",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
