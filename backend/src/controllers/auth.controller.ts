import { Request, Response } from "express";
import { registerSchema, loginSchema } from "../validators/auth.validator.js";
import { registerUser, loginUser } from "../services/auth.services.js";

export const register = async (req: Request, res: Response) => {
  try {
    const validatedData = registerSchema.parse(req.body);

    const result = await registerUser(validatedData);

    res.status(201).json({
      status: "success",
      message: "User registered successfully",
      data: result,
    });
  } catch (error) {
    console.error("Registration error:", error);

    res.status(400).json({
      status: "error",
      message: error instanceof Error ? error.message : "Registration failed",
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const validatedData = loginSchema.parse(req.body);

    const user = await loginUser(validatedData.email, validatedData.password);

    res.status(200).json({
      status: "success",
      message: "Login successful",
      data: {
        user,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(401).json({
      status: "error",
      message: error instanceof Error ? error.message : "Login failed",
    });
  }
};

export const getMe = (req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    data: {
      user: req.user,
    },
  });
};

export const adminTest = (req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    message: "Welcome Admin",
    user: req.user,
  });
};

