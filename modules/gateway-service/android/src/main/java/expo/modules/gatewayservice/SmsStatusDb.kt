package expo.modules.gatewayservice

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.util.Log

/**
 * Persistent SQLite store for SMS delivery statuses.
 *
 * This is the **single source of truth** on the device.  Every SMS that
 * passes through SmsManager gets a row here.  Rows are kept until the
 * backend acknowledges them (syncedAt != null) and then cleaned up after
 * 48 h by [deleteOlderThan].
 *
 * Concurrency: all public methods are synchronized on the helper instance
 * so they can be called safely from the service executor, the batch-flush
 * scheduler, and the sweep timer without external locking.
 */
class SmsStatusDb(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {

    companion object {
        private const val TAG = "SmsStatusDb"
        private const val DB_NAME = "sms_status.db"
        private const val DB_VERSION = 1
        private const val TABLE = "sms_status_log"
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE $TABLE (
                sms_id       INTEGER PRIMARY KEY,
                status       TEXT    NOT NULL,
                error_message TEXT,
                total_parts  INTEGER NOT NULL DEFAULT 1,
                sent_parts   INTEGER NOT NULL DEFAULT 0,
                failed_parts INTEGER NOT NULL DEFAULT 0,
                created_at   INTEGER NOT NULL,
                synced_at    INTEGER,
                sync_attempts INTEGER NOT NULL DEFAULT 0,
                last_sync_error TEXT
            )
        """.trimIndent())

        db.execSQL("CREATE INDEX idx_unsynced ON $TABLE (synced_at) WHERE synced_at IS NULL")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Future migrations go here
    }

    // ── Writes ──────────────────────────────────────────────────────

    /**
     * Insert or replace an SMS status.  Called from [SmsGatewayService.finalizeSmsDelivery]
     * and the error path in [SmsGatewayService.sendSingleSms].
     */
    @Synchronized
    fun insertOrUpdate(
        smsId: Int,
        status: String,
        errorMessage: String?,
        totalParts: Int = 1,
        sentParts: Int = 0,
        failedParts: Int = 0,
    ) {
        val cv = ContentValues().apply {
            put("sms_id", smsId)
            put("status", status)
            put("error_message", errorMessage)
            put("total_parts", totalParts)
            put("sent_parts", sentParts)
            put("failed_parts", failedParts)
            put("created_at", System.currentTimeMillis())
            putNull("synced_at")
            put("sync_attempts", 0)
            putNull("last_sync_error")
        }
        writableDatabase.insertWithOnConflict(TABLE, null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    // ── Reads ───────────────────────────────────────────────────────

    data class StatusEntry(
        val smsId: Int,
        val status: String,
        val errorMessage: String?,
        val syncAttempts: Int,
    )

    /**
     * Return up to [limit] entries that have not yet been acknowledged by
     * the server (synced_at IS NULL).  Ordered oldest-first so nothing
     * gets starved.
     */
    @Synchronized
    fun getUnsynced(limit: Int = 50): List<StatusEntry> {
        val entries = mutableListOf<StatusEntry>()
        readableDatabase.rawQuery(
            "SELECT sms_id, status, error_message, sync_attempts FROM $TABLE " +
            "WHERE synced_at IS NULL ORDER BY created_at ASC LIMIT ?",
            arrayOf(limit.toString())
        ).use { c ->
            while (c.moveToNext()) {
                entries.add(StatusEntry(
                    smsId = c.getInt(0),
                    status = c.getString(1),
                    errorMessage = if (c.isNull(2)) null else c.getString(2),
                    syncAttempts = c.getInt(3),
                ))
            }
        }
        return entries
    }

    /**
     * Return all unsynced SMS IDs (for reconciliation calls).
     */
    @Synchronized
    fun getUnsyncedIds(): List<Int> {
        val ids = mutableListOf<Int>()
        readableDatabase.rawQuery(
            "SELECT sms_id FROM $TABLE WHERE synced_at IS NULL",
            null
        ).use { c ->
            while (c.moveToNext()) ids.add(c.getInt(0))
        }
        return ids
    }

    /**
     * Count of entries not yet synced.
     */
    @Synchronized
    fun getUnsyncedCount(): Int {
        readableDatabase.rawQuery(
            "SELECT COUNT(*) FROM $TABLE WHERE synced_at IS NULL", null
        ).use { c ->
            return if (c.moveToFirst()) c.getInt(0) else 0
        }
    }

    /**
     * Total number of entries in the table.
     */
    @Synchronized
    fun getTotalCount(): Int {
        readableDatabase.rawQuery(
            "SELECT COUNT(*) FROM $TABLE", null
        ).use { c ->
            return if (c.moveToFirst()) c.getInt(0) else 0
        }
    }

    // ── Sync lifecycle ──────────────────────────────────────────────

    /**
     * Mark the given SMS IDs as successfully synced to the server.
     */
    @Synchronized
    fun markSynced(smsIds: List<Int>) {
        if (smsIds.isEmpty()) return
        val db = writableDatabase
        val now = System.currentTimeMillis()
        db.beginTransaction()
        try {
            val stmt = db.compileStatement(
                "UPDATE $TABLE SET synced_at = ?, sync_attempts = sync_attempts + 1 WHERE sms_id = ?"
            )
            for (id in smsIds) {
                stmt.bindLong(1, now)
                stmt.bindLong(2, id.toLong())
                stmt.executeUpdateDelete()
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    /**
     * Increment the sync attempt counter and record the error for entries
     * that failed to sync.  The entries remain in the DB for the next
     * sync cycle.
     */
    @Synchronized
    fun incrementSyncAttempts(smsIds: List<Int>, error: String?) {
        if (smsIds.isEmpty()) return
        val db = writableDatabase
        db.beginTransaction()
        try {
            val stmt = db.compileStatement(
                "UPDATE $TABLE SET sync_attempts = sync_attempts + 1, last_sync_error = ? WHERE sms_id = ?"
            )
            for (id in smsIds) {
                stmt.bindString(1, error ?: "unknown")
                stmt.bindLong(2, id.toLong())
                stmt.executeUpdateDelete()
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    // ── Housekeeping ────────────────────────────────────────────────

    /**
     * Delete synced entries older than [maxAgeMs] (default 48 h).
     * Called periodically to prevent unbounded DB growth.
     */
    @Synchronized
    fun deleteOlderThan(maxAgeMs: Long = 48 * 3600 * 1000L): Int {
        val cutoff = System.currentTimeMillis() - maxAgeMs
        return writableDatabase.delete(
            TABLE,
            "synced_at IS NOT NULL AND synced_at < ?",
            arrayOf(cutoff.toString())
        )
    }

    /**
     * Check if an SMS ID already exists in the status log.
     */
    @Synchronized
    fun exists(smsId: Int): Boolean {
        readableDatabase.rawQuery(
            "SELECT 1 FROM $TABLE WHERE sms_id = ? LIMIT 1",
            arrayOf(smsId.toString())
        ).use { c -> return c.moveToFirst() }
    }
}
