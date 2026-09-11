import { Router } from "express";
import {
  register,
  login,
  getMe,
  adminTest,
  refresh
} from "../controllers/auth.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { Role } from "../generated/prisma/client.js";

const router = Router();

router.post("/register", register);

router.post("/login", login);

router.post("/refresh",refresh);

router.get("/me", authenticate, getMe);

router.get("/admin-test", authenticate, authorize(Role.ADMIN), adminTest);


export default router;
