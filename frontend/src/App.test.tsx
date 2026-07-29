import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

const jsonResponse = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes("/health")) {
          return jsonResponse({ status: "ok", app: "EES", version: "0.5.0", database: "online" });
        }
        if (url.includes("/training/roles")) {
          return jsonResponse({ roles: ["Production Scheduler", "Warehouse Operator", "Weigh Technician"] });
        }
        if (url.includes("/weighing/rooms")) {
          return jsonResponse([
            { id: 1, room_code: "WR-01", name: "Weigh Room 1", status: "Available", scale_id: "SCL-101", scale_status: "Ready", calibration_due: "2026-12-31", active_po: null },
            { id: 2, room_code: "WR-02", name: "Weigh Room 2", status: "Available", scale_id: "SCL-102", scale_status: "Ready", calibration_due: "2026-12-31", active_po: null },
          ]);
        }
        if (url.includes("/weighing/tickets")) return jsonResponse([]);
        if (url.includes("/office/production-orders")) return jsonResponse([]);
        if (url.includes("/warehouse/queue")) return jsonResponse([]);
        if (url.includes("/warehouse/inventory")) return jsonResponse([]);
        if (url.includes("/office/substitutions")) return jsonResponse([]);
        if (url.includes("/events") || url.includes("/notifications")) return jsonResponse([]);

        return jsonResponse({ available: true, conflicts: [] });
      }),
    );
  });

  it("loads the zoned operations shell", async () => {
    render(<App />);

    expect(screen.getByText(/Enterprise Command Center/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("API Online")).toBeInTheDocument());
    expect(screen.getAllByText(/Office/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Warehouse/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Weighing/i).length).toBeGreaterThan(0);
  });
});
