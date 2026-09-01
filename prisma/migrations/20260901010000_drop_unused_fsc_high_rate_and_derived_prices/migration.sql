-- 유가 비중 30%(fscLowRate)만 사용하므로 70% 시나리오와 파생 가격 컬럼을 제거한다.
ALTER TABLE "quarter_settings" DROP COLUMN "fscHighRate";

ALTER TABLE "fsc_results" DROP COLUMN "fscHighRate",
DROP COLUMN "fscLowKrwPerL",
DROP COLUMN "fscHighKrwPerL";
