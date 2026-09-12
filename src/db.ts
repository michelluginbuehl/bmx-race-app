import { DATABASE_NAME } from "./config/environment"
import Dexie from "dexie"

export const db = new Dexie(DATABASE_NAME)

db.version(3).stores({
  riders: "id, name, plate, category, gender, race1, race2, race3, race4",
  appData: "key"
})
