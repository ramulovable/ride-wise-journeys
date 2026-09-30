import { createFileRoute } from "@tanstack/react-router";
import { TrainHub } from "@/components/TrainHub";

export const Route = createFileRoute("/__trainhub-test")({
  component: () => (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <TrainHub onClose={() => window.history.back()} />
    </div>
  ),
});
