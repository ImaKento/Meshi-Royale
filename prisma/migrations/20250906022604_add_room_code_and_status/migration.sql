-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'ゲスト';

-- CreateTable
CREATE TABLE "public"."Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '新しいルーム',
    "roomCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxUsers" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RoomUser" (
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomUser_pkey" PRIMARY KEY ("room_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Room_roomCode_key" ON "public"."Room"("roomCode");

-- AddForeignKey
ALTER TABLE "public"."RoomUser" ADD CONSTRAINT "RoomUser_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoomUser" ADD CONSTRAINT "RoomUser_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
