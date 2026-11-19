"use client";

import { useActionState, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { savePost } from "../actions";
import { POST_KINDS, type CampusPost } from "../schemas";
import { uploadCampusImage } from "./upload";

type Image = { path: string; preview: string | null };

export function PostEditor({
  organisationId,
  institutionId,
  canPostEmergency,
  post,
  previews,
}: {
  organisationId: string;
  institutionId: string;
  canPostEmergency: boolean;
  post?: CampusPost;
  previews?: Record<string, string>;
}) {
  const [state, action] = useActionState(savePost, idleState);
  const [images, setImages] = useState<Image[]>((post?.media ?? []).map((path) => ({ path, preview: previews?.[path] ?? null })));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const e = state.fieldErrors ?? {};
  const kinds = POST_KINDS.filter((k) => k.value !== "emergency_notice" || canPostEmergency || post?.kind === "emergency_notice");

  const add = async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files).slice(0, 6 - images.length)) {
        const path = await uploadCampusImage(file, institutionId, organisationId, "post");
        setImages((list) => [...list, { path, preview: URL.createObjectURL(file) }]);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "The image couldn't be uploaded.");
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = "";
    }
  };

  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="organisationId" value={organisationId} />
      {post && <input type="hidden" name="postId" value={post.id} />}
      {images.map((img) => (
        <input key={img.path} type="hidden" name="media" value={img.path} />
      ))}
      <div>
        <Label htmlFor="post-kind">What kind of post is this?</Label>
        <NativeSelect id="post-kind" name="kind" defaultValue={post?.kind ?? ""} invalid={Boolean(e.kind)}>
          <option value="" disabled>
            Choose a kind
          </option>
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </NativeSelect>
        {e.kind && <FieldError>{e.kind}</FieldError>}
      </div>
      <div>
        <Label htmlFor="post-title">Title</Label>
        <Input id="post-title" name="title" defaultValue={post?.title} maxLength={140} invalid={Boolean(e.title)} />
        {e.title && <FieldError>{e.title}</FieldError>}
      </div>
      <div>
        <Label htmlFor="post-body">Post</Label>
        <Textarea id="post-body" name="body" rows={8} defaultValue={post?.body} maxLength={5000} invalid={Boolean(e.body)} />
        {e.body ? <FieldError>{e.body}</FieldError> : <FieldHint>Say what&apos;s happening, when, where and who it&apos;s for.</FieldHint>}
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink-900">Images (up to 6)</legend>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.path} className="relative">
              {img.preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- local preview or short-lived signed URL
                <img
                  src={img.preview}
                  alt={`Image ${i + 1}`}
                  className="aspect-square w-full rounded-xl object-cover ring-1 ring-ink-200"
                />
              ) : (
                <span className="grid aspect-square place-items-center rounded-xl bg-ink-100 text-sm text-ink-600">Image {i + 1}</span>
              )}
              <button
                type="button"
                onClick={() => setImages((list) => list.filter((x) => x.path !== img.path))}
                className="absolute -top-2 -right-2 grid size-8 place-items-center rounded-full bg-white text-ink-900 shadow ring-1 ring-ink-200"
                aria-label={`Remove image ${i + 1}`}
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          id="post-images"
          onChange={(ev) => void add(ev.target.files)}
        />
        {images.length < 6 && (
          <Button type="button" variant="secondary" className="mt-3" disabled={uploading} onClick={() => picker.current?.click()}>
            <ImagePlus aria-hidden /> {uploading ? "Uploading…" : "Add images"}
          </Button>
        )}
        {(uploadError || e.media) && <FieldError>{uploadError ?? e.media}</FieldError>}
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="post-link">Link (optional)</Label>
          <Input
            id="post-link"
            name="linkUrl"
            type="url"
            placeholder="https://"
            defaultValue={post?.link_url ?? ""}
            invalid={Boolean(e.linkUrl)}
          />
          {e.linkUrl && <FieldError>{e.linkUrl}</FieldError>}
        </div>
        <div>
          <Label htmlFor="post-video">Video link (optional)</Label>
          <Input
            id="post-video"
            name="videoUrl"
            type="url"
            placeholder="https://"
            defaultValue={post?.video_url ?? ""}
            invalid={Boolean(e.videoUrl)}
          />
          {e.videoUrl && <FieldError>{e.videoUrl}</FieldError>}
        </div>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink-900">Who can see it</legend>
        <div className="space-y-2">
          <label className="flex items-start gap-3 rounded-lg bg-white p-3 ring-1 ring-ink-200">
            <input
              type="radio"
              name="visibility"
              value="school"
              defaultChecked={(post?.visibility ?? "school") === "school"}
              className="mt-1 size-4 accent-blue-500"
            />
            <span>
              <span className="font-medium text-ink-900">Verified students of your school</span>
              <small className="block text-ink-600">The usual choice.</small>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg bg-white p-3 ring-1 ring-ink-200">
            <input
              type="radio"
              name="visibility"
              value="public"
              defaultChecked={post?.visibility === "public"}
              className="mt-1 size-4 accent-blue-500"
            />
            <span>
              <span className="font-medium text-ink-900">Anyone with the link</span>
              <small className="block text-ink-600">
                For posts you&apos;ll share outside Perqly. Never put private details in a public post.
              </small>
            </span>
          </label>
        </div>
      </fieldset>
      <SubmitButton disabled={uploading}>{post ? "Save changes" : "Save draft"}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
