import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  if (await auth()) redirect("/");
  return <SignupForm />;
}
