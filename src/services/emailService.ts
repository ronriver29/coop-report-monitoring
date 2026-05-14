import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter: nodemailer.Transporter | null = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const cleanSecret = (val: string | undefined, key: string) => {
    let s = (val || '').trim();
    // Remove surroundings quotes
    s = s.replace(/^["']|["']$/g, '');
    // Remove accidental "KEY=" prefix if user pasted the whole line
    if (s.startsWith(`${key}=`)) {
      s = s.substring(key.length + 1);
    }
    // Final trim in case of "KEY= VALUE"
    return s.trim();
  };

  const emailUser = cleanSecret(process.env.EMAIL_USER, 'EMAIL_USER');
  const emailPass = cleanSecret(process.env.EMAIL_PASS, 'EMAIL_PASS');
  const emailFrom = cleanSecret(process.env.EMAIL_FROM, 'EMAIL_FROM') || emailUser;
  const host = cleanSecret(process.env.EMAIL_HOST, 'EMAIL_HOST');
  const portString = cleanSecret(process.env.EMAIL_PORT, 'EMAIL_PORT');
  const port = parseInt(portString || '587');
  const service = cleanSecret(process.env.EMAIL_SERVICE, 'EMAIL_SERVICE');

  console.log('--- SMTP CONFIGURATION DEBUG ---');
  console.log(`EMAIL_HOST: "${host || 'NOT SET'}"`);
  console.log(`EMAIL_PORT: "${portString || 'NOT SET'}" -> ${port}`);
  console.log(`EMAIL_SERVICE: "${service || 'NOT SET'}"`);
  console.log(`EMAIL_USER: "${emailUser}" (Length: ${emailUser.length})`);
  console.log(`EMAIL_FROM: "${emailFrom}"`);
  console.log(`PASS_PROVIDED: ${emailPass ? 'YES' : 'NO'} (Length: ${emailPass.length})`);
  
  if (emailPass && emailPass.length < 4) {
    console.warn('⚠️ WARNING: EMAIL_PASS is unusually short. Check your secrets.');
  }
  console.log('---------------------------------');

  if (!emailUser || !emailPass || emailUser === 'your-email@gmail.com' || emailUser.includes('example.com')) {
    console.warn('[SMTP INFO] Skipping transporter initialization: Credentials are missing or appear to be placeholders.');
    return null;
  }

  const transportConfig: any = {
    auth: {
      user: emailUser,
      pass: emailPass,
    },
    // Enable debugging for failed authentication
    debug: true,
    logger: true,
  };

  // STRATEGY SELECTION
  if (host && host.trim() !== '' && host !== 'smtp.gmail.com') {
    console.log(`[SMTP INFO] Strategy: Using Custom Host (${host}:${port})`);
    transportConfig.host = host;
    transportConfig.port = port;
    
    if (process.env.EMAIL_SECURE !== undefined && process.env.EMAIL_SECURE !== '') {
      transportConfig.secure = process.env.EMAIL_SECURE === 'true';
    } else {
      transportConfig.secure = port === 465;
    }
  } 
  else if (service && service.trim() !== '') {
    console.log(`[SMTP INFO] Strategy: Using Built-in Service (${service})`);
    transportConfig.service = service;
  } 
  else if (emailUser.toLowerCase().endsWith('@gmail.com')) {
    console.log(`[SMTP INFO] Strategy: Detected Gmail address, using Gmail service`);
    transportConfig.service = 'gmail';
  }
  else {
    console.log(`[SMTP INFO] Strategy: Falling back to Gmail Default`);
    transportConfig.service = 'gmail';
  }

  // Final fix for common Gmail issues:
  if (transportConfig.service === 'gmail') {
    transportConfig.tls = {
      rejectUnauthorized: false
    };
  }

  transporter = nodemailer.createTransport(transportConfig);
  return transporter;
};

let lastError: string | null = null;
let isReady = false;

export const getEmailStatus = () => {
    let helpMessage = null;
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        helpMessage = 'Missing SMTP credentials. Please set EMAIL_USER and EMAIL_PASS in Secrets.';
    } else if (lastError?.includes('535')) {
        helpMessage = 'Authentication failed. Check if you need an "App Password" (common for Gmail).';
    }

    return {
        isReady,
        lastError,
        helpMessage,
        config: {
            host: process.env.EMAIL_HOST || 'smtp.gmail.com',
            user: process.env.EMAIL_USER,
            service: process.env.EMAIL_SERVICE || (process.env.EMAIL_HOST ? 'custom' : 'gmail'),
            port: process.env.EMAIL_PORT || '587'
        }
    };
};

export const verifyEmailConfig = async () => {
    try {
        const mailTransporter = getTransporter();
        if (!mailTransporter) {
            lastError = 'Missing EMAIL_USER or EMAIL_PASS';
            isReady = false;
            console.warn('⚠️ EMAIL_USER or EMAIL_PASS environment variables are missing. Email notifications are disabled.');
            return false;
        }

        await mailTransporter.verify();
        lastError = null;
        isReady = true;
        console.log('✅ SMTP Connection verified. Email service is READY.');
        return true;
    } catch (error: any) {
        const errorMsg = error.message || String(error);
        lastError = errorMsg;
        isReady = false;
        console.warn('⚠️ EMAIL NOTIFICATIONS DISABLED');
        console.warn(`SMTP Status: ${errorMsg}`);
        
        if (errorMsg.includes('535')) {
            lastError = 'Authentication Failed (535): Invalid credentials or App Password required.';
            console.warn('⚠️ SMTP AUTHENTICATION FAILED');
            console.warn('The email server rejected your credentials. If using Gmail, an "App Password" is REQUIRED.');
            console.warn('Visit: https://myaccount.google.com/apppasswords');
        } else if (errorMsg.includes('EAI_AGAIN') || errorMsg.includes('ENOTFOUND')) {
            console.warn('⚠️ SMTP NETWORK ERROR: Check your EMAIL_HOST setting (DNS not found).');
        } else {
            console.warn(`⚠️ SMTP ERROR: ${errorMsg}`);
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
