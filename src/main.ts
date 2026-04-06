import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import morgan from "morgan";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.use(morgan("dev"));
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    await app.listen(process.env.PORT ?? 3000, "0.0.0.0", () => {
        console.log("Server running");
        console.log("DB URL runtime:", process.env.DATABASE_URL);
    });
}
bootstrap();
