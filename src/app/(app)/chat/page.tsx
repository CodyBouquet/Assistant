import { ChatClient } from "@/components/chat-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ChatPage() {
  return (
    <Card className="max-w-3xl mx-auto w-full">
      <CardHeader>
        <CardTitle>Chat</CardTitle>
        <CardDescription>
          Ask about spending, affordability, bills, or your schedule.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChatClient />
      </CardContent>
    </Card>
  );
}
