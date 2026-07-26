"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireCurrentBrand } from "@/lib/auth/current-brand";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  question: z.string().trim().min(2, "Ask a complete question.").max(1200),
  conversationId: z.string().uuid().optional(),
});

const MAX_QUESTIONS_PER_HOUR = 20;

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: string[];
  createdAt: string;
};

export type AskCarveResult =
  | { status: "success"; conversationId: string; messages: AssistantMessage[] }
  | { status: "error"; message: string };

function textFromResponse(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function titleFor(question: string): string {
  return question.length <= 72 ? question : `${question.slice(0, 69)}…`;
}

function asAssistantMessage(message: {
  id: string;
  role: string;
  content: string;
  sources: unknown;
  createdAt: Date;
}): AssistantMessage {
  return {
    id: message.id,
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
    sources: Array.isArray(message.sources)
      ? message.sources.filter((source): source is string => typeof source === "string")
      : [],
    createdAt: message.createdAt.toISOString(),
  };
}

export async function askCarve(input: unknown): Promise<AskCarveResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check your question." };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { status: "error", message: "The assistant is not configured yet. Please contact support." };
  }

  try {
    const brand = await requireCurrentBrand();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const questionsThisHour = await prisma.chatMessage.count({
      where: {
        role: "user",
        createdAt: { gte: oneHourAgo },
        conversation: { brandId: brand.id },
      },
    });

    if (questionsThisHour >= MAX_QUESTIONS_PER_HOUR) {
      return { status: "error", message: "You have reached the assistant limit for this hour. Please try again shortly." };
    }

    const conversation = parsed.data.conversationId
      ? await prisma.chatConversation.findFirst({
          where: { id: parsed.data.conversationId, brandId: brand.id },
        })
      : await prisma.chatConversation.create({
          data: { brandId: brand.id, title: titleFor(parsed.data.question) },
        });

    if (!conversation) {
      return { status: "error", message: "That conversation is not available." };
    }

    const [context, priorMessages] = await Promise.all([
      prisma.brand.findUnique({
        where: { id: brand.id },
        select: {
          name: true,
          category: true,
          description: true,
          wholesalePrice: true,
          retailPrice: true,
          dtcAnnualRevenue: true,
          heldCertifications: true,
          isDtcOnly: true,
          unitsPerStorePerWeek: true,
          leadTimeDays: true,
          hasKeheRelationship: true,
          hasUnfiRelationship: true,
          ediCapable: true,
          eftCapable: true,
          hasCoManufacturer: true,
          hasRegionalProductionCapacity: true,
          assessments: {
            select: {
              overallScore: true,
              blockerDimension: true,
              blockerStatement: true,
              retailer: { select: { name: true, requirements: true } },
              costWaterfall: {
                select: { investorVerdict: true, verdictStatement: true, founderMarginPct: true },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      }),
      prisma.chatMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" },
        take: 12,
      }),
    ]);

    if (!context) {
      return { status: "error", message: "Your brand information is not available yet." };
    }

    const sources = [
      "Brand profile",
      ...context.assessments.map((assessment) => `Assessment: ${assessment.retailer.name}`),
    ];
    const transcript: Anthropic.MessageParam[] = priorMessages.map(
      (message): Anthropic.MessageParam => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      }),
    );

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: process.env.CARVE_CHAT_MODEL || "claude-haiku-4-5",
      max_tokens: 650,
      system: [
        "You are Carve, a practical retail-readiness assistant for a CPG founder.",
        "Use only the supplied Carve context. Never invent retailer requirements, certifications, pricing, contacts, deadlines, or results.",
        "If the context does not contain the answer, say exactly what is missing and suggest the next concrete step.",
        "Be concise, candid, and operational. Do not present legal, financial, or regulatory advice as definitive.",
        "Do not claim to have sent emails, submitted applications, or changed data.",
        `Carve context:\n${JSON.stringify(context)}`,
      ].join("\n\n"),
      messages: [...transcript, { role: "user", content: parsed.data.question }],
    });
    const answer = textFromResponse(response);
    if (!answer) {
      return { status: "error", message: "The assistant did not return an answer. Please try again." };
    }

    const [, assistantMessage] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: { conversationId: conversation.id, role: "user", content: parsed.data.question },
      }),
      prisma.chatMessage.create({
        data: { conversationId: conversation.id, role: "assistant", content: answer, sources },
      }),
      prisma.chatConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
    ]);

    return {
      status: "success",
      conversationId: conversation.id,
      messages: [asAssistantMessage(assistantMessage)],
    };
  } catch (error) {
    console.error("Carve assistant failed", error);
    return { status: "error", message: "The assistant could not answer right now. Please try again in a moment." };
  }
}
