import { cn } from "@/lib/utils";

/** Rabbit hole icon – uses public/rabbit.svg directly. */
export function RabbitIcon({ className, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src="/rabbit.svg"
      alt=""
      role="presentation"
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}
