import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.ts';
import { UserRole } from '../constants.ts';
import dotenv from 'dotenv';

dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || 'missing',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'missing',
      callbackURL: `${(process.env.APP_URL || '').trim().replace(/\/$/, '')}/api/auth/google/callback`,
      proxy: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let email = profile.emails?.[0].value;
        
        if (!email) {
          return done(new Error('No email found in Google profile'), undefined);
        }

        // Normalize email to remove accidental double-dots or spaces
        email = email.trim().toLowerCase().replace(/\.\.+/g, '.');

        // --- DOMAIN WALL ---
        if (!email.endsWith('@cda.gov.ph') && email !== 'ronrivera29@gmail.com') { // Included user email for testing
          return done(new Error('Access restricted to @cda.gov.ph accounts'), undefined);
        }

        let user = await User.findOne({ googleId: profile.id });

        if (user) {
          if (!user.isActive) {
            return done(new Error('Account is deactivated'), undefined);
          }
        } else {
          user = await User.create({
            googleId: profile.id,
            displayName: profile.displayName,
            email: email,
            role: UserRole.VIEWER,
            isActive: true
          });
        }

        return done(null, user);
      } catch (err) {
        return done(err as Error, undefined);
      }
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});
