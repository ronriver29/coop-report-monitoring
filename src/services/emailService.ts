import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter: nodemailer.Transporter | null = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  const emailFrom = process.env.EMAIL_FROM || emailUser;
  const host = process.env.EMAIL_HOST;
  const portString = process.env.EMAIL_PORT;
  const port = parseInt(portString || '587');
  const service = process.env.EMAIL_SERVICE;

  console.log('--- SMTP CONFIGURATION DEBUG ---');
  console.log(`EMAIL_HOST: "${host}"`);
  console.log(`EMAIL_PORT: "${portString}" -> ${port}`);
  console.log(`EMAIL_SERVICE: "${service}"`);
  console.log(`EMAIL_USER: "${emailUser}"`);
  console.log(`EMAIL_FROM: "${emailFrom}"`);
  console.log('---------------------------------');

  if (!emailUser || !emailPass) {
    console.warn('[SMTP INFO] Skipping transporter initialization: EMAIL_USER or EMAIL_PASS missing.');
    return null;
  }

  const transportConfig: any = {
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  };

  // STRATEGY SELECTION
  // 1. If EMAIL_HOST is provided and it looks like a custom server (NOT smtp.gmail.com by default empty)
  if (host && host.trim() !== '' && host !== 'smtp.gmail.com') {
    console.log(`[SMTP INFO] Strategy: Using Custom Host (${host}:${port})`);
    transportConfig.host = host;
    transportConfig.port = port;
    
    // Explicitly set secure based on env or port
    if (process.env.EMAIL_SECURE !== undefined && process.env.EMAIL_SECURE !== '') {
      transportConfig.secure = process.env.EMAIL_SECURE === 'true';
    } else {
      transportConfig.secure = port === 465;
    }
    
    // Explicitly disable service fallback if custom host is used
    delete transportConfig.service;
  } 
  // 2. If EMAIL_SERVICE is provided (e.g. 'gmail')
  else if (service && service.trim() !== '') {
    console.log(`[SMTP INFO] Strategy: Using Built-in Service (${service})`);
    transportConfig.service = service;
  } 
  // 3. Absolute Fallback to Gmail
  else {
    console.log(`[SMTP INFO] Strategy: Falling back to Gmail Default`);
    transportConfig.service = 'gmail';
  }

  console.log('[SMTP INFO] Final Transport Config (redacted):', {
    host: transportConfig.host,
    port: transportConfig.port,
    service: transportConfig.service,
    secure: transportConfig.secure,
    user: transportConfig.auth.user
  });

  transporter = nodemailer.createTransport(transportConfig);

  return transporter;
};

export const verifyEmailConfig = async () => {
    try {
        const mailTransporter = getTransporter();
        if (!mailTransporter) {
            console.warn('⚠️ EMAIL_USER or EMAIL_PASS environment variables are missing. Email notifications are disabled.');
            return false;
        }

        await mailTransporter.verify();
        console.log('✅ SMTP Connection verified. Email service is READY.');
        return true;
    } catch (error: any) {
        const errorMsg = error.message || String(error);
        console.error('❌ EMAIL CONFIGURATION ERROR');
        console.error(`SMTP Status: ${errorMsg}`);
        
        if (errorMsg.includes('535')) {
            console.error('DIAGNOSIS: Authentication Failed (Invalid Credentials).');
            console.error('---------------------------------------------------------');
            console.error(`CURRENT HOST: ${process.env.EMAIL_HOST || 'smtp.gmail.com'}`);
            console.error(`CURRENT USER: ${process.env.EMAIL_USER}`);
            console.error('---------------------------------------------------------');
            console.error('FOR SMTP2GO USERS:');
            console.error('1. Set EMAIL_HOST to: mail.smtp2go.com');
            console.error('2. Set EMAIL_PORT to: 2525 (Recommended) or 587');
            console.error('3. Verify your SMTP Username/Password in SMTP2GO Dashboard > Settings > SMTP Users');
            console.error('4. Ensure your "Sender" email matches an authorized domain in SMTP2GO.');
            console.error('---------------------------------------------------------');
            console.error('FOR GMAIL USERS:');
            console.error('1. You MUST use an "App Password" (not regular password).');
            console.error('2. Create one at https://myaccount.google.com/apppasswords');
            console.error('---------------------------------------------------------');
        } else if (errorMsg.includes('EAI_AGAIN') || errorMsg.includes('ENOTFOUND')) {
            console.error('DIAGNOSIS: Network/DNS Error. Check your EMAIL_HOST setting.');
        }

        // Wipe the transporter so it can be re-initialized if env vars change
        transporter = null;
        return false;
    }
};

export const sendWelcomeEmail = async (email: string, displayName: string, tempPass: string) => {
  const loginUrl = process.env.APP_URL || 'https://ais-dev-rfpxeharzta5kokkad2yno-350097616864.asia-southeast1.run.app';
  
  try {
    const mailTransporter = getTransporter();
    if (!mailTransporter) {
      console.error('CRITICAL: Welcome email failed to send - Service not configured.');
      return false;
    }
    const senderEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    
    const mailOptions = {
      from: `"CDA Monitoring System" <${senderEmail}>`,
      to: email,
      replyTo: senderEmail,
      subject: 'Welcome to CDA Report Monitoring System - Account Created',
      html: `
        <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
          <h2 style="color: #2563eb;">Welcome to CDA Monitoring, ${displayName}!</h2>
          <p>Your account has been created by a System Administrator.</p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #64748b; text-transform: uppercase; font-weight: bold;">Temporary Credentials</p>
            <p style="margin: 10px 0 0 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 5px 0 0 0;"><strong>Password:</strong> <code style="background: #e2e8f0; padding: 2px 4px; border-radius: 4px;">${tempPass}</code></p>
          </div>
          
          <p>For security reasons, please change your password immediately after logging in.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Login to System</a>
          </div>
          
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">This is an automated message from the CDA Cooperative Development Authority.</p>
        </div>
      `,
    };

    const info = await mailTransporter.sendMail(mailOptions);
    console.log('Welcome email sent successfully: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('CRITICAL: Welcome email failed to send.');
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('SMTP Error:', errorMsg);
    
    if (errorMsg.includes('535')) {
      console.error('DIAGNOSIS: Authentication Failed (535).');
      console.error('ACTION REQUIRED: Check your EMAIL_USER/EMAIL_PASS. See verifyEmailConfig logs for detailed instructions.');
    }
    
    return false;
  }
};
