import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export function PinField({
  value,
  onChange,
  length = 4,
  disabled,
  onComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  onComplete?: (value: string) => void;
}) {
  return (
    <div className="flex justify-center">
      <InputOTP
        maxLength={length}
        value={value}
        disabled={disabled}
        inputMode="numeric"
        onChange={(next) => {
          const digits = next.replace(/\D/g, "");
          onChange(digits);
          if (digits.length === length) onComplete?.(digits);
        }}
      >
        <InputOTPGroup className="gap-2">
          {Array.from({ length }, (_, index) => (
            <InputOTPSlot
              key={index}
              index={index}
              className="h-12 w-12 rounded-xl border text-lg font-semibold"
            />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}
