import { prisma } from "../config/prisma.js";

export const createCategory = async (name: string, organizationId: string) => {
  const existingCategory = await prisma.category.findFirst({
    where: {
      name,
      organizationId,
    },
  });

  if (existingCategory) {
    throw new Error("Category already exists");
  }

  return prisma.category.create({
    data: {
      name,
      organizationId,
    },
  });
};

export const getCategories = async (organizationId: string) => {
  return prisma.category.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};