export interface TeamPackagePicker {
  pickPackage(): Promise<string | null>;
}
