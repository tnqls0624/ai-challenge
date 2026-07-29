package com.dontworry.spike

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class DeviceSessionSnapshot(
    val careConnectionId: String?,
    val connected: Boolean,
    val deviceId: String?,
    val subjectId: String?,
)

class DeviceSessionStore(context: Context) {
    private val preferences =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun getOrCreateInstallationId(): String {
        preferences.getString(KEY_INSTALLATION_ID, null)?.let { return it }
        val installationId = UUID.randomUUID().toString()
        preferences.edit().putString(KEY_INSTALLATION_ID, installationId).commit()
        return installationId
    }

    fun getOrCreatePublicKey(): String {
        val keyStore = loadKeyStore()
        if (!keyStore.containsAlias(SIGNING_KEY_ALIAS)) {
            val generator = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_RSA,
                ANDROID_KEY_STORE,
            )
            generator.initialize(
                KeyGenParameterSpec.Builder(
                    SIGNING_KEY_ALIAS,
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
                )
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setSignaturePaddings(KeyProperties.SIGNATURE_PADDING_RSA_PKCS1)
                    .setKeySize(2048)
                    .build(),
            )
            generator.generateKeyPair()
        }
        val certificate = loadKeyStore().getCertificate(SIGNING_KEY_ALIAS)
            ?: error("Android Keystore public key is unavailable")
        return Base64.encodeToString(certificate.publicKey.encoded, Base64.NO_WRAP)
    }

    fun saveActivation(
        credential: String,
        deviceId: String,
        subjectId: String,
        careConnectionId: String,
    ) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateEncryptionKey())
        val encrypted = cipher.doFinal(credential.toByteArray(Charsets.UTF_8))
        preferences.edit()
            .putString(KEY_CREDENTIAL_IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString(KEY_CREDENTIAL_DATA, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString(KEY_DEVICE_ID, deviceId)
            .putString(KEY_SUBJECT_ID, subjectId)
            .putString(KEY_CONNECTION_ID, careConnectionId)
            .commit()
    }

    fun readCredential(): String? {
        val iv = preferences.getString(KEY_CREDENTIAL_IV, null) ?: return null
        val encrypted = preferences.getString(KEY_CREDENTIAL_DATA, null) ?: return null
        return runCatching {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                getOrCreateEncryptionKey(),
                GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)),
            )
            cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP))
                .toString(Charsets.UTF_8)
        }.getOrNull()
    }

    fun snapshot(): DeviceSessionSnapshot {
        return DeviceSessionSnapshot(
            careConnectionId = preferences.getString(KEY_CONNECTION_ID, null),
            connected = readCredential() != null,
            deviceId = preferences.getString(KEY_DEVICE_ID, null),
            subjectId = preferences.getString(KEY_SUBJECT_ID, null),
        )
    }

    private fun getOrCreateEncryptionKey(): SecretKey {
        val keyStore = loadKeyStore()
        (keyStore.getKey(ENCRYPTION_KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEY_STORE,
        )
        generator.init(
            KeyGenParameterSpec.Builder(
                ENCRYPTION_KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private fun loadKeyStore(): KeyStore {
        return KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
    }

    companion object {
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
        private const val ENCRYPTION_KEY_ALIAS = "dontworry-device-credential-v1"
        private const val SIGNING_KEY_ALIAS = "dontworry-device-identity-v1"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val PREFERENCES = "device_session"
        private const val KEY_INSTALLATION_ID = "installation_id"
        private const val KEY_CREDENTIAL_IV = "credential_iv"
        private const val KEY_CREDENTIAL_DATA = "credential_data"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_SUBJECT_ID = "subject_id"
        private const val KEY_CONNECTION_ID = "care_connection_id"
    }
}
