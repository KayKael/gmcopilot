import { GripVertical } from "lucide-react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
} from "react-resizable-panels";

import { cn } from "@/lib/utils";

/**
 * react-resizable-panels v4 flips separator aria-orientation vs group orientation:
 * - horizontal Group → Separator aria-orientation="vertical"  → vertical bar (w-px)
 * - vertical Group   → Separator aria-orientation="horizontal" → horizontal bar (h-px w-full)
 */
const ResizablePanelGroup = ({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof Group>) => (
  <Group
    orientation={orientation}
    className={cn("h-full w-full min-h-0 min-w-0", className)}
    {...props}
  />
);

const ResizablePanel = Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
}) => (
  <Separator
    className={cn(
      "relative flex w-px items-center justify-center bg-border",
      "after:absolute after:inset-y-0 after:left-1/2 after:w-1.5 after:-translate-x-1/2",
      // Horizontal bar when separator is horizontal (vertical groups)
      "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full",
      "aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1.5 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2",
      "[&[aria-orientation=horizontal]>div]:rotate-90",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
      "hover:bg-primary/40 data-[separator=hover]:bg-primary/40 data-[separator=active]:bg-primary/60",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-border bg-background">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </Separator>
);

export {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  useDefaultLayout,
  usePanelRef,
};
