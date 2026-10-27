import { Router, type IRouter } from "express";
import healthRouter from "./health";
import communityRouter from "./community";
import geolocationRouter from "./geolocation";

const router: IRouter = Router();

router.use(healthRouter);
router.use(geolocationRouter);
router.use("/community", communityRouter);

export default router;
