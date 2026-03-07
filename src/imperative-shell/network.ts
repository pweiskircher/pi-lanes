// pattern: Imperative Shell

import {createServer} from "node:net";

export async function getPortStatus(port: number): Promise<"free" | "in_use"> {
  return await new Promise<"free" | "in_use">(resolve => {
    const server = createServer();

    server.once("error", error => {
      if (isAddressInUseError(error)) {
        resolve("in_use");
        return;
      }
      resolve("in_use");
    });

    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve("free"));
    });
  });
}

function isAddressInUseError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}
