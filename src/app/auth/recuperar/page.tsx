import type { Metadata } from "next";
import ForgotPasswordForm from "@/features/auth/components/forgot-password-form";
export const metadata: Metadata = {
  title: "Recuperar acceso | City Ofertas",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
