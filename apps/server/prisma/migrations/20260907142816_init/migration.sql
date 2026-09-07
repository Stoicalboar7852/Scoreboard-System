-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'FINALS', 'COMPLETE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PLANNED', 'LIVE', 'COMPLETE');

-- CreateEnum
CREATE TYPE "FixtureStage" AS ENUM ('REGULAR', 'SF1', 'SF2', 'PF', 'GF');

-- CreateEnum
CREATE TYPE "FixtureStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'FORFEIT', 'BYE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TeamSide" AS ENUM ('HOME', 'AWAY');

-- CreateEnum
CREATE TYPE "ClockMode" AS ENUM ('SINGLE', 'AUTO');

-- CreateEnum
CREATE TYPE "ClockStatus" AS ENUM ('IDLE', 'RUNNING', 'PAUSED');

-- CreateEnum
CREATE TYPE "ClockPhase" AS ENUM ('PRE_GAME', 'HALF_1', 'HALF_TIME', 'HALF_2', 'BETWEEN_GAMES', 'WAITING_FOR_LINKED', 'FINISHED');

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "venueName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Australia/Sydney',
    "controllerPinHash" TEXT,
    "nextGameWindowMinutes" INTEGER NOT NULL DEFAULT 30,
    "defaultTimeoutSeconds" INTEGER NOT NULL DEFAULT 60,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT false,
    "accentOverrides" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameFormat" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "halfSeconds" INTEGER NOT NULL,
    "halfTimeSeconds" INTEGER NOT NULL,
    "betweenGamesSeconds" INTEGER NOT NULL,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 60,
    "colour" TEXT NOT NULL DEFAULT '#FBBF24',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameFormat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtFormat" (
    "courtId" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,

    CONSTRAINT "CourtFormat_pkey" PRIMARY KEY ("courtId","formatId")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "regularWeeks" INTEGER NOT NULL,
    "skippedDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "finalsTemplate" JSONB NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nightOfWeek" INTEGER NOT NULL,
    "formatId" TEXT NOT NULL,
    "ladderRule" JSONB NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "ladderLockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinalsSeed" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinalsSeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "colour" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPlayer" (
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,

    CONSTRAINT "TeamPlayer_pkey" PRIMARY KEY ("teamId","playerId")
);

-- CreateTable
CREATE TABLE "TeamClashLink" (
    "id" TEXT NOT NULL,
    "teamAId" TEXT NOT NULL,
    "teamBId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamClashLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT,
    "date" TEXT NOT NULL,
    "nightOfWeek" INTEGER NOT NULL,
    "firstSlotTime" TEXT NOT NULL,
    "slotLengthMinutes" INTEGER NOT NULL,
    "slotCount" INTEGER NOT NULL DEFAULT 0,
    "linkShorterToLonger" BOOLEAN NOT NULL DEFAULT false,
    "status" "SessionStatus" NOT NULL DEFAULT 'PLANNED',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fixture" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT,
    "competitionId" TEXT,
    "sessionId" TEXT,
    "roundNumber" INTEGER,
    "slotIndex" INTEGER,
    "courtId" TEXT,
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "homeName" TEXT,
    "awayName" TEXT,
    "stage" "FixtureStage" NOT NULL DEFAULT 'REGULAR',
    "finalsKey" TEXT,
    "homeRef" JSONB,
    "awayRef" JSONB,
    "status" "FixtureStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "forfeitBy" "TeamSide",
    "completedAt" TIMESTAMP(3),
    "resultNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LadderAdjustment" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "pointsDelta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LadderAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clock" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "formatId" TEXT,
    "label" TEXT NOT NULL,
    "mode" "ClockMode" NOT NULL DEFAULT 'AUTO',
    "status" "ClockStatus" NOT NULL DEFAULT 'IDLE',
    "phase" "ClockPhase" NOT NULL DEFAULT 'PRE_GAME',
    "phaseDurationMs" INTEGER NOT NULL,
    "phaseStartedAt" TIMESTAMP(3),
    "remainingAtPauseMs" INTEGER,
    "linkedClockId" TEXT,
    "slotIndex" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtLiveState" (
    "courtId" TEXT NOT NULL,
    "sessionId" TEXT,
    "clockId" TEXT,
    "currentFixtureId" TEXT,
    "nextFixtureId" TEXT,
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "timeoutActive" BOOLEAN NOT NULL DEFAULT false,
    "timeoutStartedAt" TIMESTAMP(3),
    "timeoutDurationMs" INTEGER NOT NULL DEFAULT 0,
    "timeoutCalledBy" "TeamSide",
    "lastControllerSeen" TIMESTAMP(3),
    "lastScoreboardSeen" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourtLiveState_pkey" PRIMARY KEY ("courtId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "courtId" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "deviceId" TEXT,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Court_name_key" ON "Court"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GameFormat_name_key" ON "GameFormat"("name");

-- CreateIndex
CREATE INDEX "Competition_nightOfWeek_idx" ON "Competition"("nightOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_seasonId_name_key" ON "Competition"("seasonId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FinalsSeed_competitionId_seed_key" ON "FinalsSeed"("competitionId", "seed");

-- CreateIndex
CREATE UNIQUE INDEX "FinalsSeed_competitionId_teamId_key" ON "FinalsSeed"("competitionId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_competitionId_name_key" ON "Team"("competitionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TeamClashLink_teamAId_teamBId_key" ON "TeamClashLink"("teamAId", "teamBId");

-- CreateIndex
CREATE INDEX "Session_date_idx" ON "Session"("date");

-- CreateIndex
CREATE INDEX "Fixture_sessionId_slotIndex_courtId_idx" ON "Fixture"("sessionId", "slotIndex", "courtId");

-- CreateIndex
CREATE INDEX "Fixture_competitionId_roundNumber_idx" ON "Fixture"("competitionId", "roundNumber");

-- CreateIndex
CREATE INDEX "Fixture_status_idx" ON "Fixture"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_tokenHash_key" ON "DeviceToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "CourtFormat" ADD CONSTRAINT "CourtFormat_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtFormat" ADD CONSTRAINT "CourtFormat_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "GameFormat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "GameFormat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalsSeed" ADD CONSTRAINT "FinalsSeed_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalsSeed" ADD CONSTRAINT "FinalsSeed_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPlayer" ADD CONSTRAINT "TeamPlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPlayer" ADD CONSTRAINT "TeamPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamClashLink" ADD CONSTRAINT "TeamClashLink_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamClashLink" ADD CONSTRAINT "TeamClashLink_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LadderAdjustment" ADD CONSTRAINT "LadderAdjustment_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LadderAdjustment" ADD CONSTRAINT "LadderAdjustment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clock" ADD CONSTRAINT "Clock_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clock" ADD CONSTRAINT "Clock_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "GameFormat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtLiveState" ADD CONSTRAINT "CourtLiveState_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtLiveState" ADD CONSTRAINT "CourtLiveState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtLiveState" ADD CONSTRAINT "CourtLiveState_clockId_fkey" FOREIGN KEY ("clockId") REFERENCES "Clock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtLiveState" ADD CONSTRAINT "CourtLiveState_currentFixtureId_fkey" FOREIGN KEY ("currentFixtureId") REFERENCES "Fixture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtLiveState" ADD CONSTRAINT "CourtLiveState_nextFixtureId_fkey" FOREIGN KEY ("nextFixtureId") REFERENCES "Fixture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;
