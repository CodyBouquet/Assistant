import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SchedulePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule</CardTitle>
        <CardDescription>
          Calendar with optional Google Calendar sync. Stub for v1.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-neutral-500">
        Placeholder. Google OAuth slot reserved in settings; wire up when ready.
      </CardContent>
    </Card>
  );
}
