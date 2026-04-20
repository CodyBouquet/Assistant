import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  async function sendLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    await signIn("nodemailer", { email, redirectTo: "/dashboard" });
  }

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            We&apos;ll email you a one-time magic link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={sendLink} className="flex flex-col gap-3">
            <Input
              type="email"
              name="email"
              placeholder="you@example.com"
              required
            />
            <Button type="submit">Send link</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
