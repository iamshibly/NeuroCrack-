import { z } from "zod";

const incomingMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().max(4000),
});

// 4 MB in base64 ≈ 5.5 MB of raw string — cap at 6 MB of string length to be safe
const MAX_IMAGE_STRING_LENGTH = 6_000_000;

export const askRequestSchema = z
  .object({
    message: z.string().max(2000, "Message too long"),
    selectedClass: z.string().min(1, "Class is required"),
    selectedSubject: z.string().min(1, "Subject is required"),
    selectedChapter: z.string().nullable().optional(),
    chatId: z.string().min(1, "Chat ID is required"),
    recentMessages: z.array(incomingMessageSchema).max(20).default([]),
    image: z
      .string()
      .max(MAX_IMAGE_STRING_LENGTH, "Image payload too large (max 4 MB)")
      .refine(
        (s) => s.startsWith("data:image/"),
        "Image must be a valid data URL (data:image/...)",
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.message.trim() && !data.image) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide a message or attach an image",
        path: ["message"],
      });
    }
  });

export type ValidatedAskRequest = z.infer<typeof askRequestSchema>;
