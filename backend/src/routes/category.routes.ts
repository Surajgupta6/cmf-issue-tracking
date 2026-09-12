import { Router } from "express";
import { createCategoryController , getCategoriesController } from "../controllers/category.controller";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware.js"
import { Role } from "../generated/prisma/client.js";

const router = Router();

router.post("/",authenticate,authorize(Role.ADMIN,Role.MANAGER),createCategoryController);
router.get("/",authenticate,getCategoriesController);

export default router;

