import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center">
      <AlertCircle className="h-16 w-16 text-destructive mb-6 opacity-80" />
      <h1 className="text-4xl font-bold tracking-tight mb-2 font-mono">{t("notFound.code")}</h1>
      <h2 className="text-xl font-medium text-muted-foreground mb-6 font-mono">{t("notFound.systemNotFound")}</h2>
      <p className="max-w-md text-muted-foreground mb-8">{t("notFound.description")}</p>
      <Link href="/">
        <Button>{t("notFound.backHome")}</Button>
      </Link>
    </div>
  );
}
