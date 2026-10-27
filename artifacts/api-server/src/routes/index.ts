import { Router, type IRouter } from "express";
import healthRouter from "./health";
import communityRouter from "./community";
import geolocationRouter from "./geolocation";
import marketRouter from "./market";

const router: IRouter = Router();

router.use(healthRouter);
router.use(geolocationRouter);
router.use(marketRouter);
router.use("/community", communityRouter);

export default router;
