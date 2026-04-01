import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatFileLinksProvider } from "@/components/chat-file-links-provider";
import { ChatMarkdown } from "@/components/markdown-renderer";
import { createArtifactFilePathResolver } from "@/lib/messages/chat-file-links";

describe("ChatMarkdown artifact file links", () => {
  it("does not linkify when artifact file links are not enabled", () => {
    const open = vi.fn();

    render(
      <ChatFileLinksProvider
        value={{
          resolve: (raw) => (raw === "src/app/page.tsx" ? raw : null),
          open,
        }}
      >
        <ChatMarkdown>Open src/app/page.tsx, please.</ChatMarkdown>
      </ChatFileLinksProvider>,
    );

    expect(screen.queryByRole("button", { name: "src/app/page.tsx" })).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });

  it("linkifies prose path mentions when explicitly enabled", () => {
    const open = vi.fn();

    render(
      <ChatFileLinksProvider
        value={{
          resolve: (raw) => (raw === "src/app/page.tsx" ? raw : null),
          open,
        }}
      >
        <ChatMarkdown enableArtifactFileLinks>Open src/app/page.tsx, please.</ChatMarkdown>
      </ChatFileLinksProvider>,
    );

    const button = screen.getByRole("button", { name: "src/app/page.tsx" });
    fireEvent.click(button);

    expect(open).toHaveBeenCalledWith("src/app/page.tsx");
    expect(button.closest("p")).toHaveTextContent("Open src/app/page.tsx, please.");
  });

  it("linkifies inline code path mentions", () => {
    const open = vi.fn();

    render(
      <ChatFileLinksProvider
        value={{
          resolve: (raw) => (raw === ".env" ? raw : null),
          open,
        }}
      >
        <ChatMarkdown enableArtifactFileLinks>{`Use \`.env\` here.`}</ChatMarkdown>
      </ChatFileLinksProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: ".env" }));

    expect(open).toHaveBeenCalledWith(".env");
  });

  it("does not linkify fenced code blocks", () => {
    const open = vi.fn();

    render(
      <ChatFileLinksProvider
        value={{
          resolve: (raw) => (raw === "src/app/page.tsx" ? raw : null),
          open,
        }}
      >
        <ChatMarkdown enableArtifactFileLinks>{`\
\`\`\`ts
src/app/page.tsx
\`\`\`
`}</ChatMarkdown>
      </ChatFileLinksProvider>,
    );

    expect(screen.queryByRole("button", { name: "src/app/page.tsx" })).not.toBeInTheDocument();
    expect(screen.getByText("src/app/page.tsx")).toBeInTheDocument();
  });

  it("keeps existing markdown links as normal anchors", () => {
    render(
      <ChatFileLinksProvider
        value={{
          resolve: (raw) => (raw === "src/app/page.tsx" ? raw : null),
          open: vi.fn(),
        }}
      >
        <ChatMarkdown enableArtifactFileLinks>{`[docs](https://example.com) src/app/page.tsx`}</ChatMarkdown>
      </ChatFileLinksProvider>,
    );

    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(screen.getByRole("button", { name: "src/app/page.tsx" })).toBeInTheDocument();
  });

  it("links nested inline-code paths exactly when a root file shares the basename", () => {
    const open = vi.fn();
    const resolve = createArtifactFilePathResolver({
      artifactId: "coach",
      filePaths: ["intro.py", "src/intro.py"],
    });

    render(
      <ChatFileLinksProvider value={{ resolve, open }}>
        <ChatMarkdown enableArtifactFileLinks>{`Created \`src/intro.py\` inside a new \`src/\` folder.`}</ChatMarkdown>
      </ChatFileLinksProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "src/intro.py" }));

    expect(open).toHaveBeenCalledWith("src/intro.py");
    expect(screen.queryByRole("button", { name: "src/" })).not.toBeInTheDocument();
  });

  it("does not linkify when no artifact file context is present", () => {
    render(<ChatMarkdown enableArtifactFileLinks>Open src/app/page.tsx</ChatMarkdown>);

    expect(screen.queryByRole("button", { name: "src/app/page.tsx" })).not.toBeInTheDocument();
    expect(screen.getByText("Open src/app/page.tsx")).toBeInTheDocument();
  });
});
