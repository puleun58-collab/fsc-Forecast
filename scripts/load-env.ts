import { config as loadEnv } from "dotenv";

// import 문은 호이스팅되므로 .env 로딩은 반드시 별도 모듈의 최상단 import로 선행되어야 한다.
loadEnv({ path: ".env.local", override: true });
loadEnv();
