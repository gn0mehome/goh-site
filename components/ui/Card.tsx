import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className, hover = true, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        "card-wood p-4 transition-shadow duration-200",
        hover && "hover:shadow-lg",
        className
      )}
    >
      {children}
    </div>
  );
}
