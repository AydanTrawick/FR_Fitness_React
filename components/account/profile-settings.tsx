"use client";
import NextImage from "next/image";
import { useState, useRef, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { profileSchema } from "@/lib/auth/validation";
import { api } from "@/lib/client";
import { useAccount } from "./settings-context";
export function ProfileSettings() {
  const { data, working, perform } = useAccount();
  const user = data!.user;
  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name,
      bio: user.bio || "",
      weightUnit: user.weightUnit as "kg" | "lb",
      distanceUnit: user.distanceUnit as "km" | "mi",
      timezone: user.timezone,
      goal: user.goal as "consistency",
      image: user.image,
    },
  });
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [photoError, setPhotoError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useWatch({ control: form.control, name: "image" });
  useEffect(() => {
    if (!source || !canvas.current) return;
    const context = canvas.current.getContext("2d");
    if (!context) return;
    const size = Math.min(source.width, source.height) / zoom;
    context.drawImage(
      source,
      (source.width - size) / 2,
      (source.height - size) / 2,
      size,
      size,
      0,
      0,
      400,
      400,
    );
  }, [source, zoom]);
  const fields = form.formState.errors;
  async function choose(file: File | undefined) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5000000
    ) {
      setPhotoError("Choose a JPG, PNG, or WebP under 5 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setSource(img);
      setZoom(1);
      URL.revokeObjectURL(url);
      setPhotoError("");
    };
    img.onerror = () => {
      setPhotoError("That image could not be opened. Try another.");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
  return (
    <section className="settings-card">
      <div className="profile-photo">
        {image ? (
          <NextImage
            unoptimized
            width={80}
            height={80}
            src={image}
            alt="Your profile"
          />
        ) : (
          <div
            className="profile-photo-placeholder"
            aria-label="Profile initials"
          >
            {user.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <div className="row wrap">
            <button
              className="photo-upload"
              onClick={() => input.current?.click()}
            >
              Upload photo
            </button>
            {image && (
              <button
                className="text-link"
                onClick={() =>
                  form.setValue("image", null, { shouldDirty: true })
                }
              >
                Remove
              </button>
            )}
          </div>
          <p>JPG, PNG, or WebP. Up to 5 MB.</p>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        </div>
      </div>
      {photoError && (
        <p className="field-error" role="alert">
          {photoError}
        </p>
      )}
      {source && (
        <div className="photo-crop">
          <canvas
            ref={canvas}
            width={400}
            height={400}
            aria-label="Photo crop preview"
          />
          <label htmlFor="photo-zoom">Zoom to crop</label>
          <input
            id="photo-zoom"
            type="range"
            min="1"
            max="3"
            step=".05"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <div className="row">
            <button
              className="btn primary"
              onClick={() => {
                form.setValue(
                  "image",
                  canvas.current!.toDataURL("image/jpeg", 0.85),
                  { shouldDirty: true },
                );
                setSource(null);
              }}
            >
              Use photo
            </button>
            <button className="btn secondary" onClick={() => setSource(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <form
        className="account-form"
        onSubmit={form.handleSubmit(
          (values) =>
            void perform(async () => {
              await api("account/profile", values, "PUT");
              form.reset(values);
            }, "Profile saved."),
        )}
      >
        <label htmlFor="profile-name">Display name</label>
        <input
          id="profile-name"
          autoComplete="name"
          {...form.register("name")}
        />
        {fields.name && <p className="field-error">{fields.name.message}</p>}
        <label htmlFor="profile-bio">Bio</label>
        <textarea
          id="profile-bio"
          maxLength={500}
          placeholder="A little about you and your training."
          {...form.register("bio")}
        />
        {fields.bio && <p className="field-error">{fields.bio.message}</p>}
        <div className="settings-form-grid">
          <div className="settings-field">
            <label htmlFor="profile-weight">Weight units</label>
            <select id="profile-weight" {...form.register("weightUnit")}>
              <option value="kg">Kilograms (kg)</option>
              <option value="lb">Pounds (lb)</option>
            </select>
          </div>
          <div className="settings-field">
            <label htmlFor="profile-distance">Distance units</label>
            <select id="profile-distance" {...form.register("distanceUnit")}>
              <option value="km">Kilometers (km)</option>
              <option value="mi">Miles (mi)</option>
            </select>
          </div>
        </div>
        <label htmlFor="profile-timezone">Time zone</label>
        <input
          id="profile-timezone"
          list="timezones"
          {...form.register("timezone")}
        />
        <datalist id="timezones">
          {[
            "America/New_York",
            "America/Chicago",
            "America/Denver",
            "America/Los_Angeles",
            "Europe/London",
            "Europe/Paris",
            "Asia/Tokyo",
            "Australia/Sydney",
            "UTC",
          ].map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {fields.timezone && (
          <p className="field-error">{fields.timezone.message}</p>
        )}
        <label htmlFor="profile-goal">Training goal</label>
        <select id="profile-goal" {...form.register("goal")}>
          <option value="strength">Build strength</option>
          <option value="muscle">Build muscle</option>
          <option value="fitness">Improve fitness</option>
          <option value="consistency">Stay consistent</option>
        </select>
        <div className="settings-footer">
          <button
            className="account-button primary"
            disabled={working || !form.formState.isDirty}
          >
            {working ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
