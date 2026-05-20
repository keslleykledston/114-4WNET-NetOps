import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center">
      <AlertCircle className="h-16 w-16 text-destructive mb-6 opacity-80" />
      <h1 className="text-4xl font-bold tracking-tight mb-2 font-mono">404</h1>
      <h2 className="text-xl font-medium text-muted-foreground mb-6 font-mono">SYSTEM_NOT_FOUND</h2>
      <p className="max-w-md text-muted-foreground mb-8">
        The requested management interface or resource could not be located on the current node. 
        Please verify the URI and try again.
      </p>
      <Link href="/">
        <Button>Return to Dashboard</Button>
      </Link>
    </div>
  );
}
