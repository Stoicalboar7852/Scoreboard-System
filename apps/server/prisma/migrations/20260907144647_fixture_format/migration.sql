-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "formatId" TEXT;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "GameFormat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
