import express, { Request, Response } from "express";
import { errorHandler } from "./middleware/error.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import categoryRoutes from "./routes/category.routes.js"

const app = express();

app.use(express.json());

app.get("/api/v1/health", (req: Request, res: Response) => {
    res.json({
        status: "ok",
        service: "cmf-issue-tracker"
    });
});
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/auth", authRoutes);

app.get("/api/v1/test-error", (req: Request, res: Response) => {
    throw new Error("Something went wrong");
});


app.use(errorHandler);

export default app;