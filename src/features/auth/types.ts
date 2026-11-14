export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const idleState: FormState = { status: "idle" };

export type TotpEnrollment = { factorId: string; qrCode: string; secret: string };
