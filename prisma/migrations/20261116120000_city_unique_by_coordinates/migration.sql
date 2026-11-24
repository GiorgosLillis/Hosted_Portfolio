-- DropIndex
DROP INDEX "cities_name_country_userId_key";

-- CreateIndex
CREATE UNIQUE INDEX "cities_userId_latitude_longitude_key" ON "cities"("userId", "latitude", "longitude");
