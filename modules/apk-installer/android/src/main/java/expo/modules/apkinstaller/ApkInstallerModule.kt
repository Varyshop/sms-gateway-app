package expo.modules.apkinstaller

import android.content.Intent
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import java.io.File

class ApkInstallerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ApkInstaller")

        AsyncFunction("installApk") { filePath: String, promise: Promise ->
            val context = appContext.reactContext
            if (context == null) {
                promise.reject(CodedException("ERR_CONTEXT", "React context is null", null))
                return@AsyncFunction
            }

            try {
                val sourceFile = File(filePath)
                if (!sourceFile.exists()) {
                    promise.reject(CodedException("ERR_FILE", "APK file not found: $filePath", null))
                    return@AsyncFunction
                }

                val cacheDir = File(context.cacheDir, "apk_updates")
                cacheDir.mkdirs()
                val apkFile = File(cacheDir, "update.apk")
                sourceFile.copyTo(apkFile, overwrite = true)

                val authority = "${context.packageName}.apkinstaller"
                val uri = FileProvider.getUriForFile(context, authority, apkFile)

                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }

                context.startActivity(intent)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject(CodedException("ERR_INSTALL", "Failed to install APK: ${e.message}", e))
            }
        }
    }
}
