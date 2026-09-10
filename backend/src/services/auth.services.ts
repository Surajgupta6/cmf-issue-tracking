import bcrypt from "bcrypt";
import { prisma } from "../config/prisma.js";
import { generateAccessToken } from "../utils/jwt.js";
import { generateRefreshToken, hashRefreshToken } from "../utils/refresh-token.js";

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  organizationName: string;
}

export const registerUser = async (input: RegisterInput) => {
  const { name, email, password, organizationName } = input;

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (existingUser) {
    throw new Error("User with this email already exists");
  }
  const passwordHash = await bcrypt.hash(password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: organizationName,
      },
    });

    const user = await tx.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: "CUSTOMER",
        organizationId: organization.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organizationId: true,
        createdAt: true,
      },
    });

    return {
      user,
      organization,
    };
  });

  return result;
};

export const loginUser = async (email: string, password: string) => {

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    throw new Error("Invalid email or password");
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }

  const accessToken = generateAccessToken({
    userId: user.id,
    role: user.role,
    organizationId: user.organizationId,
  });

  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);

  await prisma.refreshToken.create({
    data: {
      tokenHash: refreshTokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });


  return {
    user :{
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  },accessToken,
  refreshToken,
  };
};