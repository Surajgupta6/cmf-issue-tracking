import { z } from "zod";

/**
 * Validation schema for creating a comment.
 *
 * Content is trimmed to avoid leading/trailing whitespace-only comments.
 * Max length of 5000 characters is consistent with issue description.
 */
export const createCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty")
    .max(5000, "Comment cannot exceed 5000 characters"),
});

/**
 * Validation schema for updating a comment.
 * Same rules as create — only the content field is editable.
 */
export const updateCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty")
    .max(5000, "Comment cannot exceed 5000 characters"),
});
