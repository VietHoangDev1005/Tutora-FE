// src/pages/Login/ResetPasswordPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { supabase } from "../../lib/supabase";
import { syncPassword } from "../../services/auth.service";
import Header from "../../components/Header/Header";
import Footer from "../../components/Footer/Footer";
import styles from "../../styles/pages/reset-password.module.css";

// SVG Icons
const LockIcon = () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
);

const EyeOpenIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EyeClosedIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
);

const CheckCircleIcon = () => (
    <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd" />
    </svg>
);

const XCircleIcon = () => (
    <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd" />
    </svg>
);

const ArrowLeftIcon = () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
);

const ResetPasswordPage: React.FC = () => {
    const navigate = useNavigate();
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const initSession = async () => {
            try {
                // === Flow 1: PKCE flow (Supabase v2 default) ===
                // Supabase redirects with ?code=xxx in query string
                const urlParams = new URLSearchParams(window.location.search);
                const code = urlParams.get("code");

                if (code) {
                    console.log("🔑 PKCE flow detected, exchanging code for session...");
                    const { error } = await supabase.auth.exchangeCodeForSession(code);
                    if (error) {
                        console.error("❌ Code exchange failed:", error);
                        throw error;
                    }
                    console.log("✅ Session established via PKCE");
                    if (isMounted) setIsReady(true);
                    return;
                }

                // === Flow 2: Implicit/Hash flow (legacy fallback) ===
                // Older Supabase redirects with #access_token=xxx&type=recovery
                const hashParams = new URLSearchParams(window.location.hash.substring(1));
                const token = hashParams.get("access_token");
                const type = hashParams.get("type");

                if (token && type === "recovery") {
                    console.log("🔑 Hash flow detected, setting session...");
                    const { error } = await supabase.auth.setSession({
                        access_token: token,
                        refresh_token: hashParams.get("refresh_token") || "",
                    });
                    if (error) {
                        console.error("❌ Set session failed:", error);
                        throw error;
                    }
                    console.log("✅ Session established via hash flow");
                    if (isMounted) setIsReady(true);
                    return;
                }

                // === Flow 3: Check if session already exists ===
                // onAuthStateChange PASSWORD_RECOVERY may have already set the session
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    console.log("🔑 Existing recovery session found");
                    if (isMounted) setIsReady(true);
                    return;
                }

                // No valid token/code found
                throw new Error("No recovery token found");

            } catch (error) {
                console.error("Reset password init error:", error);
                if (isMounted) {
                    toast.error("Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn");
                    setTimeout(() => navigate("/login"), 2000);
                }
            }
        };

        initSession();

        // Also listen for PASSWORD_RECOVERY event as additional fallback
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === "PASSWORD_RECOVERY") {
                console.log("🔑 PASSWORD_RECOVERY event received");
                if (isMounted) setIsReady(true);
            }
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, [navigate]);

    const getPasswordStrength = (password: string) => {
        if (password.length === 0) return { strength: "", color: "", width: "0%" };
        if (password.length < 8) return { strength: "Yếu", color: "#631b1b", width: "33%" };
        if (password.length < 10) return { strength: "Trung bình", color: "#d4b483", width: "66%" };
        return { strength: "Mạnh", color: "#3d4a3e", width: "100%" };
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!newPassword || !confirmPassword) {
            toast.warning("Vui lòng nhập đầy đủ thông tin!");
            return;
        }

        if (newPassword !== confirmPassword) {
            toast.error("Mật khẩu xác nhận không khớp!");
            return;
        }

        if (newPassword.length < 8) {
            toast.error("Mật khẩu phải có ít nhất 8 ký tự");
            return;
        }

        try {
            setIsLoading(true);

            // Step 1: Update password on Supabase
            const { error: supabaseError } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (supabaseError) {
                // Handle specific Supabase errors with Vietnamese messages
                if (supabaseError.message?.includes("same") || supabaseError.message?.includes("different")) {
                    toast.error("Mật khẩu mới không được trùng với mật khẩu cũ. Vui lòng chọn mật khẩu khác.");
                } else if (supabaseError.message?.includes("weak")) {
                    toast.error("Mật khẩu quá yếu. Vui lòng chọn mật khẩu mạnh hơn.");
                } else {
                    toast.error("Có lỗi xảy ra khi đặt lại mật khẩu. Vui lòng thử lại.");
                }
                console.error("Supabase password update error:", supabaseError);
                return;
            }

            // Step 2: Sync password with backend (best-effort)
            // Even if sync fails, Supabase password is already changed successfully
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const currentToken = session?.access_token;

                if (currentToken) {
                    await syncPassword(currentToken, newPassword);
                    console.log("✅ Password synced with backend");
                } else {
                    console.warn("⚠️ No session token available for backend sync");
                }
            } catch (syncError) {
                // Backend sync failed, but Supabase password was already changed.
                // The backend will re-sync on next login attempt.
                console.warn("⚠️ Backend password sync failed (will re-sync on login):", syncError);
            }

            // Step 3: Sign out and redirect to login
            await supabase.auth.signOut();

            toast.success("Đặt lại mật khẩu thành công! Vui lòng đăng nhập lại.");
            setTimeout(() => navigate("/login"), 1500);
        } catch (error: any) {
            console.error("Reset password error:", error);
            toast.error("Có lỗi xảy ra khi đặt lại mật khẩu. Vui lòng thử lại.");
        } finally {
            setIsLoading(false);
        }
    };

    const passwordStrength = getPasswordStrength(newPassword);

    return (
        <div className={styles.page}>
            <Header />

            <div className={styles.container}>
                <div className={styles.wrapper}>
                    <div className={styles.card}>
                        <div className={styles.cardContent}>
                            {/* Icon */}
                            <div className={styles.iconCircle}>
                                <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>

                            <h1 className={styles.title}>Đặt lại mật khẩu</h1>
                            <p className={styles.description}>Nhập mật khẩu mới cho tài khoản của bạn</p>

                            <form onSubmit={handleSubmit}>
                                {/* New Password */}
                                <div className={styles.fieldGroup}>
                                    <label htmlFor="newPassword" className={styles.label}>Mật khẩu mới</label>
                                    <div className={styles.inputWrapper}>
                                        <div className={styles.inputIcon}><LockIcon /></div>
                                        <input
                                            id="newPassword"
                                            type={showPassword ? "text" : "password"}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className={styles.input}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className={styles.toggleBtn}
                                        >
                                            {showPassword ? <EyeOpenIcon /> : <EyeClosedIcon />}
                                        </button>
                                    </div>

                                    {/* Password strength indicator */}
                                    {newPassword && (
                                        <div className={styles.strengthContainer}>
                                            <div className={styles.strengthHeader}>
                                                <span className={styles.strengthLabel}>Độ mạnh mật khẩu:</span>
                                                <span className={styles.strengthValue} style={{ color: passwordStrength.color }}>
                                                    {passwordStrength.strength}
                                                </span>
                                            </div>
                                            <div className={styles.strengthTrack}>
                                                <div
                                                    className={styles.strengthBar}
                                                    style={{
                                                        width: passwordStrength.width,
                                                        backgroundColor: passwordStrength.color,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Confirm Password */}
                                <div className={styles.fieldGroupLast}>
                                    <label htmlFor="confirmPassword" className={styles.label}>Xác nhận mật khẩu</label>
                                    <div className={styles.inputWrapper}>
                                        <div className={styles.inputIcon}><LockIcon /></div>
                                        <input
                                            id="confirmPassword"
                                            type={showConfirmPassword ? "text" : "password"}
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className={styles.input}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className={styles.toggleBtn}
                                        >
                                            {showConfirmPassword ? <EyeOpenIcon /> : <EyeClosedIcon />}
                                        </button>
                                    </div>

                                    {/* Password match indicator */}
                                    {confirmPassword && (
                                        newPassword === confirmPassword ? (
                                            <div className={styles.matchSuccess}>
                                                <CheckCircleIcon /> Mật khẩu khớp
                                            </div>
                                        ) : (
                                            <div className={styles.matchError}>
                                                <XCircleIcon /> Mật khẩu không khớp
                                            </div>
                                        )
                                    )}
                                </div>

                                {/* Submit */}
                                <button type="submit" disabled={isLoading || !isReady} className={styles.btnPrimary}>
                                    {isLoading ? (
                                        <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            <svg className={styles.spinner} width="20" height="20" fill="none" viewBox="0 0 24 24">
                                                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path style={{ opacity: 0.75 }} fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Đang xử lý...
                                        </span>
                                    ) : (
                                        "Đặt lại mật khẩu"
                                    )}
                                </button>

                                {/* Back to login */}
                                <div style={{ textAlign: "center" }}>
                                    <button type="button" onClick={() => navigate("/login")} className={styles.backLink}>
                                        <ArrowLeftIcon /> Quay lại đăng nhập
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div className={styles.accentBar} />
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
};

export default ResetPasswordPage;
