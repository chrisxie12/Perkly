"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintAgreementButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      <Printer aria-hidden /> Print or save as PDF
    </Button>
  );
}
