import { describe, expect, it } from "vitest";
import { canvaUrl } from "./[[route]]";

describe("canva download proxy", () => {
  it("accepts Canva's own https links", () => {
    expect(canvaUrl("https://export-download.canva.com/abc/1.jpg?X-Amz=1")).toContain("export-download.canva.com");
  });
  it("refuses anything else", () => {
    for (const bad of [null, "", "http://export-download.canva.com/a.jpg", "https://canva.com.evil.example/a", "https://evil.example/?u=canva.com", "https://user:pw@www.canva.com/a", "https://www.canva.com:8443/a", "not a url"]) {
      expect(canvaUrl(bad)).toBeNull();
    }
  });
});
