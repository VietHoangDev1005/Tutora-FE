/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/ForgotPasswordModal.tsx
// Luồng quên mật khẩu qua SỐ ĐIỆN THOẠI + OTP (không qua Supabase email).
//   B1: nhập SĐT  -> POST /auth/forgot-password (BE gửi OTP qua SMS)
//   B2: nhập OTP + mật khẩu mới -> POST /auth/reset-password
import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import { forgotPasswordPhone, resetPasswordPhone } from "../services/auth.service";
import styles from "../styles/components/forgot-password-modal.module.css";

interface ForgotPasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const COOLDOWN_SECONDS = 60;
const MAX_RESEND_ATTEMPTS = 3;

type Step = "phone" | "reset";

const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
    isOpen,
    onClose,
}) => {
    const [step, setStep] = useState<Step>("phone");
    const [phone, setPhone] = useState("");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [resendCount, setResendCount] = useState(0);
    const [showNewPw, setShowNewPw] = useState(false);
    const [showConfirmPw, setShowConfirmPw] = useState(false);

    // Cooldown timer
    useEffect(() => {
        if (cooldown <= 0) return;

        const timer = setInterval(() => {
            setCooldown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [cooldown]);

    const resetState = () => {
        setStep("phone");
        setPhone("");
        setOtp("");
        setNewPassword("");
        setConfirmPassword("");
        setCooldown(0);
        setResendCount(0);
        setShowNewPw(false);
        setShowConfirmPw(false);
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    // --- B1: gửi OTP tới số điện thoại ---
    const sendOtp = useCallback(async (isResend = false) => {
        const phoneDigits = phone.replace(/\D/g, "");
        if (phoneDigits.length < 9 || phoneDigits.length > 11) {
            toast.error("Số điện thoại không hợp lệ!");
            return;
        }

        if (cooldown > 0) {
            toast.info(`Vui lòng đợi ${cooldown} giây trước khi gửi lại.`);
            return;
        }

        if (isResend && resendCount >= MAX_RESEND_ATTEMPTS) {
            toast.warning("Bạn đã vượt quá số lần gửi cho phép. Vui lòng thử lại sau.");
            return;
        }

        try {
            setIsLoading(true);
            await forgotPasswordPhone(phone.trim());
            // BE báo lỗi rõ ràng nếu SĐT chưa đăng ký (xem SimpleAuthService.ForgotPasswordAsync) —
            // nên tới được đây nghĩa là SĐT hợp lệ và OTP đã thực sự được gửi.
            setStep("reset");
            setCooldown(COOLDOWN_SECONDS);
            if (isResend) setResendCount((prev) => prev + 1);
            toast.success("Mã OTP đã được gửi qua SMS.");
        } catch (error: any) {
            toast.error(error.response?.data?.message || "Có lỗi xảy ra. Vui lòng thử lại.");
        } finally {
            setIsLoading(false);
        }
    }, [phone, cooldown, resendCount]);

    const handleSendOtp = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        sendOtp(false);
    };

    // --- B2: đặt lại mật khẩu bằng OTP ---
    const handleResetPassword = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        const code = otp.replace(/\D/g, "");
        if (code.length !== 6) {
            toast.warning("Vui lòng nhập đủ 6 chữ số mã OTP.");
            return;
        }
        if (!newPassword || !confirmPassword) {
            toast.warning("Vui lòng nhập đầy đủ mật khẩu mới!");
            return;
        }
        if (newPassword.length < 8) {
            toast.error("Mật khẩu phải có ít nhất 8 ký tự.");
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error("Mật khẩu xác nhận không khớp!");
            return;
        }

        try {
            setIsLoading(true);
            await resetPasswordPhone(phone.trim(), code, newPassword);
            toast.success("Đặt lại mật khẩu thành công! Vui lòng đăng nhập lại.");
            handleClose();
        } catch (error: any) {
            toast.error(error.response?.data?.message || "Có lỗi xảy ra. Vui lòng thử lại.");
        } finally {
            setIsLoading(false);
        }
    };

    const isResendDisabled = cooldown > 0 || resendCount >= MAX_RESEND_ATTEMPTS || isLoading;

    if (!isOpen) return null;

    // Bắt buộc render qua portal ở body: modal này được gọi từ trong `.login-form`, mà khối đó
    // có `position: relative; z-index: 10` nên tạo ra một stacking context. Nằm trong đó thì
    // `z-index: 100000` của overlay chỉ so với các phần tử cùng khối, còn ra ngoài nó chỉ đáng
    // giá 10 — thua header (z-index 200). Kết quả: header phủ lên mép trên modal và ăn luôn cả
    // nút đóng, bấm ✕ không được. Portal đưa overlay lên thẳng body nên 100000 mới có tác dụng.
    return createPortal(
        <div className={styles.overlay}>
            {/* Backdrop */}
            <div className={styles.backdrop} onClick={handleClose} />

            {/* Modal */}
            <div className={styles.modal}>
                {/* Close button */}
                <button onClick={handleClose} className={styles.closeBtn}>
                    <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Content */}
                <div className={styles.content}>
                    {step === "phone" ? (
                        <div>
                            {/* Icon */}
                            <div className={styles.iconCircleBurgundy}>
                                <svg width="28" height="28" fill="none" stroke="#631b1b" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                                </svg>
                            </div>

                            {/* Title & Description */}
                            <h2 className={styles.title}>Quên mật khẩu?</h2>
                            <p className={styles.description}>
                                Nhập số điện thoại của bạn và chúng tôi sẽ gửi mã OTP để đặt lại mật khẩu
                            </p>

                            {/* Form */}
                            <form onSubmit={handleSendOtp}>
                                <div style={{ marginBottom: "24px" }}>
                                    <label htmlFor="forgot-phone" className={styles.label}>Số điện thoại</label>
                                    <div className={styles.inputWrapper}>
                                        <div className={styles.inputIcon}>
                                            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                    d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                                            </svg>
                                        </div>
                                        <input
                                            id="forgot-phone"
                                            name="phone"
                                            type="tel"
                                            autoComplete="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="090..."
                                            className={styles.input}
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading || cooldown > 0}
                                    className={styles.btnPrimary}
                                >
                                    {isLoading ? (
                                        <>
                                            <svg className={styles.spinner} width="20" height="20" fill="none" viewBox="0 0 24 24">
                                                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path style={{ opacity: 0.75 }} fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Đang gửi...
                                        </>
                                    ) : cooldown > 0 ? (
                                        `Gửi lại sau ${cooldown}s`
                                    ) : (
                                        "Gửi mã OTP"
                                    )}
                                </button>
                            </form>
                        </div>
                    ) : (
                        // Step 2: nhập OTP + mật khẩu mới
                        <div>
                            <div className={styles.iconCircleBurgundy}>
                                <svg width="28" height="28" fill="none" stroke="#631b1b" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>

                            <h2 className={styles.title}>Đặt lại mật khẩu</h2>
                            <p className={styles.description}>
                                Nhập mã OTP đã gửi tới{" "}
                                <span className={styles.emailHighlight}>{phone}</span> và mật khẩu mới của bạn
                            </p>

                            <form onSubmit={handleResetPassword}>
                                <div style={{ marginBottom: "16px" }}>
                                    <label htmlFor="reset-otp" className={styles.label}>Mã xác thực (OTP)</label>
                                    <div className={styles.inputWrapper}>
                                        <input
                                            id="reset-otp"
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            maxLength={6}
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                            placeholder="______"
                                            className={styles.input}
                                            style={{ paddingLeft: 16, letterSpacing: "0.5em", textAlign: "center", fontSize: 18, fontWeight: 700 }}
                                        />
                                    </div>
                                </div>

                                <div style={{ marginBottom: "16px" }}>
                                    <label htmlFor="reset-new-password" className={styles.label}>Mật khẩu mới</label>
                                    <div className={styles.inputWrapper}>
                                        <div className={styles.inputIcon}>
                                            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                            </svg>
                                        </div>
                                        <input
                                            id="reset-new-password"
                                            type={showNewPw ? "text" : "password"}
                                            autoComplete="new-password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className={`${styles.input} ${styles.inputPassword}`}
                                        />
                                        <button
                                            type="button"
                                            className={styles.eyeBtn}
                                            onClick={() => setShowNewPw((v) => !v)}
                                            aria-label={showNewPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                                        >
                                            {showNewPw ? <EyeOffIcon /> : <EyeIcon />}
                                        </button>
                                    </div>
                                </div>

                                <div style={{ marginBottom: "24px" }}>
                                    <label htmlFor="reset-confirm-password" className={styles.label}>Xác nhận mật khẩu</label>
                                    <div className={styles.inputWrapper}>
                                        <div className={styles.inputIcon}>
                                            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                            </svg>
                                        </div>
                                        <input
                                            id="reset-confirm-password"
                                            type={showConfirmPw ? "text" : "password"}
                                            autoComplete="new-password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className={`${styles.input} ${styles.inputPassword}`}
                                        />
                                        <button
                                            type="button"
                                            className={styles.eyeBtn}
                                            onClick={() => setShowConfirmPw((v) => !v)}
                                            aria-label={showConfirmPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                                        >
                                            {showConfirmPw ? <EyeOffIcon /> : <EyeIcon />}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className={styles.btnPrimary}
                                >
                                    {isLoading ? (
                                        <>
                                            <svg className={styles.spinner} width="20" height="20" fill="none" viewBox="0 0 24 24">
                                                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path style={{ opacity: 0.75 }} fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Đang xử lý...
                                        </>
                                    ) : (
                                        "Đặt lại mật khẩu"
                                    )}
                                </button>

                                {resendCount >= MAX_RESEND_ATTEMPTS ? (
                                    <p className={styles.cooldownText}>
                                        Bạn đã gửi tối đa {MAX_RESEND_ATTEMPTS} lần. Vui lòng thử lại sau.
                                    </p>
                                ) : (
                                    <div style={{ textAlign: "center", marginTop: 12 }}>
                                        <button
                                            type="button"
                                            onClick={() => sendOtp(true)}
                                            disabled={isResendDisabled}
                                            className={`${styles.btnLink} ${isResendDisabled ? styles.btnLinkDisabled : ""}`}
                                        >
                                            {cooldown > 0
                                                ? `Gửi lại mã sau ${cooldown}s`
                                                : "Không nhận được mã? Gửi lại"}
                                        </button>
                                    </div>
                                )}
                            </form>
                        </div>
                    )}
                </div>

                {/* Decorative Accent Bar */}
                <div className={styles.accentBar} />
            </div>
        </div>,
        document.body,
    );
};

const EyeIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EyeOffIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
);

export default ForgotPasswordModal;
